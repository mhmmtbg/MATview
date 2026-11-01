//go:build windows

package main

// Yerel klasör seçici + yerel dosya yazıcı.
// Tarayıcının klasör izni (showDirectoryPicker) bazı klasörleri "sistem dosyası içeriyor" diye reddeder (sürücü kökü,
// kullanıcı klasörü, AppData, uygulama veri klasörünü içeren klasörler …). Yerel pencerede (WebView2) çıktı klasörü
// Windows'un kendi klasör seçicisiyle seçilir; dosyalar 127.0.0.1 üzerinde yalnız bu sayfanın bildiği bir anahtarla
// çalışan küçük bir yazıcıya akıtılır (büyük çıktılar parça parça, belleğe alınmadan yazılır). Yalnız seçilen
// klasörlerin altına yazılabilir.

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

var (
	ole32               = syscall.NewLazyDLL("ole32.dll")
	shell32             = syscall.NewLazyDLL("shell32.dll")
	pCoInitializeEx     = ole32.NewProc("CoInitializeEx")
	pCoCreateInstance   = ole32.NewProc("CoCreateInstance")
	pCoTaskMemFree      = ole32.NewProc("CoTaskMemFree")
	pSHCreateItemFromPN = shell32.NewProc("SHCreateItemFromParsingName")
)

type guid struct {
	D1 uint32
	D2 uint16
	D3 uint16
	D4 [8]byte
}

var (
	clsidFileOpenDialog = guid{0xDC1C5A9C, 0xE88A, 0x4DDE, [8]byte{0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7}}
	iidIFileOpenDialog  = guid{0xD57C7288, 0xD4AD, 0x4768, [8]byte{0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60}}
	iidIShellItem       = guid{0x43826D1E, 0xE718, 0x42EE, [8]byte{0xBC, 0x55, 0xA1, 0xE2, 0x61, 0xC3, 0x7B, 0xFE}}
)

// COM yöntem çağrısı: nesnenin sanal tablosundaki i. işlev
func comCall(obj uintptr, i int, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + uintptr(i)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{obj}, args...)...)
	return r
}

// pickFolder: Windows klasör seçici (IFileOpenDialog, FOS_PICKFOLDERS). İptalde "".
func pickFolder(owner uintptr, start, title string) string {
	pCoInitializeEx.Call(0, 2) // COINIT_APARTMENTTHREADED (zaten başlatılmışsa zararsız)
	var dlg uintptr
	if r, _, _ := pCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidFileOpenDialog)), 0, 1 /*CLSCTX_INPROC_SERVER*/, uintptr(unsafe.Pointer(&iidIFileOpenDialog)), uintptr(unsafe.Pointer(&dlg))); r != 0 || dlg == 0 {
		return ""
	}
	defer comCall(dlg, 2) // Release
	var opts uint32
	comCall(dlg, 10, uintptr(unsafe.Pointer(&opts)))             // GetOptions
	comCall(dlg, 9, uintptr(opts|0x20|0x40|0x800))               // SetOptions: PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST
	if t, err := syscall.UTF16PtrFromString(title); err == nil { // SetTitle
		comCall(dlg, 17, uintptr(unsafe.Pointer(t)))
	}
	if start != "" {
		if st, err := os.Stat(start); err == nil && st.IsDir() {
			if p, err := syscall.UTF16PtrFromString(start); err == nil {
				var item uintptr
				if r, _, _ := pSHCreateItemFromPN.Call(uintptr(unsafe.Pointer(p)), 0, uintptr(unsafe.Pointer(&iidIShellItem)), uintptr(unsafe.Pointer(&item))); r == 0 && item != 0 {
					comCall(dlg, 12, item) // SetFolder
					comCall(item, 2)
				}
			}
		}
	}
	if comCall(dlg, 3, owner) != 0 { // Show: iptal ya da hata
		return ""
	}
	var item uintptr
	if comCall(dlg, 20, uintptr(unsafe.Pointer(&item))) != 0 || item == 0 { // GetResult
		return ""
	}
	defer comCall(item, 2)
	var ps *uint16
	if comCall(item, 5, 0x80058000, uintptr(unsafe.Pointer(&ps))) != 0 || ps == nil { // GetDisplayName(SIGDN_FILESYSPATH)
		return ""
	}
	defer pCoTaskMemFree.Call(uintptr(unsafe.Pointer(ps)))
	n := 0
	for p := uintptr(unsafe.Pointer(ps)); *(*uint16)(unsafe.Pointer(p)) != 0; p += 2 {
		n++
	}
	return syscall.UTF16ToString(unsafe.Slice(ps, n))
}

// ---- yerel dosya yazıcı ----
type fsBridge struct {
	mu    sync.Mutex
	roots []string
	token string
	port  int
}

func (b *fsBridge) allow(dir string) bool {
	p, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	if st, err := os.Stat(p); err != nil || !st.IsDir() {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, r := range b.roots {
		if strings.EqualFold(r, p) {
			return true
		}
	}
	b.roots = append(b.roots, filepath.Clean(p))
	return true
}

// inside: yol mutlak, temiz ve izin verilen bir kökün altında mı (.. ile dışarı çıkılamaz)
func (b *fsBridge) inside(p string) (string, bool) {
	if p == "" || !filepath.IsAbs(p) {
		return "", false
	}
	c := filepath.Clean(p)
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, r := range b.roots {
		rel, err := filepath.Rel(r, c)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel) {
			return c, true
		}
	}
	return "", false
}

func (b *fsBridge) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "PUT, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "*")
	h.Set("Access-Control-Allow-Private-Network", "true")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	q := r.URL.Query()
	if q.Get("t") != b.token {
		http.Error(w, "yetkisiz", http.StatusForbidden)
		return
	}
	p, ok := b.inside(q.Get("p"))
	if !ok {
		http.Error(w, "izin verilmeyen yol", http.StatusForbidden)
		return
	}
	switch r.URL.Path {
	case "/mkdir":
		if err := os.MkdirAll(p, 0o755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "/write":
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		flag := os.O_CREATE | os.O_WRONLY | os.O_TRUNC
		if q.Get("a") == "1" {
			flag = os.O_CREATE | os.O_WRONLY | os.O_APPEND
		}
		f, err := os.OpenFile(p, flag, 0o644)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, err = io.Copy(f, r.Body)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func startFsBridge() *fsBridge {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil
	}
	k := make([]byte, 24)
	if _, err := rand.Read(k); err != nil {
		ln.Close()
		return nil
	}
	b := &fsBridge{token: hex.EncodeToString(k), port: ln.Addr().(*net.TCPAddr).Port}
	go http.Serve(ln, b)
	return b
}
