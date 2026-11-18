//go:build windows

package main

// Yerel klasör seçici + yerel dosya yazıcı.
// Tarayıcının klasör izni (showDirectoryPicker) bazı klasörleri "sistem dosyası içeriyor" diye reddeder (sürücü kökü,
// kullanıcı klasörü, AppData, uygulama veri klasörünü içeren klasörler …). Yerel pencerede (WebView2) çıktı klasörü
// Windows'un kendi klasör seçicisiyle seçilir; dosyalar 127.0.0.1 üzerinde yalnız bu sayfanın bildiği bir anahtarla
// çalışan küçük bir yazıcıya akıtılır (büyük çıktılar parça parça, belleğe alınmadan yazılır). Yalnız seçilen
// klasörlerin altına yazılabilir.

import (
	"os"
	"path/filepath"
	"strings"
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
	pShellExecuteW      = shell32.NewProc("ShellExecuteW")
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

// openFolder: izin verilen bir klasörü (ya da altını) Windows Gezgini'nde açar
func (b *fsBridge) openFolder(p string) bool {
	c, ok := b.inside(p)
	if !ok {
		return false
	}
	if st, err := os.Stat(c); err != nil || !st.IsDir() {
		return false
	}
	verb, _ := syscall.UTF16PtrFromString("open")
	path, _ := syscall.UTF16PtrFromString(c)
	r, _, _ := pShellExecuteW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(path)), 0, 0, 1 /*SW_SHOWNORMAL*/)
	return r > 32
}

var (
	clsidFileSaveDialog = guid{0xC0B4E2F3, 0xBA21, 0x4773, [8]byte{0x8D, 0xBA, 0x33, 0x5E, 0xC9, 0x46, 0xEB, 0x8B}}
	iidIFileSaveDialog  = guid{0x84BCCD23, 0x5FDE, 0x4CDB, [8]byte{0xAE, 0xA4, 0xAF, 0x64, 0xB8, 0x3D, 0x78, 0xAB}}
)

type filterSpec struct{ name, spec *uint16 }

// saveFile: Windows "Farklı kaydet" penceresi (IFileSaveDialog). Önerilen ad ve başlangıç klasörü verilir; varolan
// dosyanın üzerine yazmadan önce Windows sorar. İptalde "".
func saveFile(owner uintptr, name, start string) string {
	pCoInitializeEx.Call(0, 2)
	var dlg uintptr
	if r, _, _ := pCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidFileSaveDialog)), 0, 1, uintptr(unsafe.Pointer(&iidIFileSaveDialog)), uintptr(unsafe.Pointer(&dlg))); r != 0 || dlg == 0 {
		return ""
	}
	defer comCall(dlg, 2) // Release
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	u := func(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }
	var specs []filterSpec
	if ext != "" {
		label := strings.ToUpper(ext) + " dosyası (*." + ext + ")"
		if ext == "mat" {
			label = "MATLAB verisi (*.mat)"
		}
		specs = append(specs, filterSpec{u(label), u("*." + ext)})
		comCall(dlg, 22, uintptr(unsafe.Pointer(u(ext)))) // SetDefaultExtension
	}
	specs = append(specs, filterSpec{u("Tüm dosyalar (*.*)"), u("*.*")})
	comCall(dlg, 4, uintptr(len(specs)), uintptr(unsafe.Pointer(&specs[0]))) // SetFileTypes
	var opts uint32
	comCall(dlg, 10, uintptr(unsafe.Pointer(&opts)))                  // GetOptions
	comCall(dlg, 9, uintptr(opts|0x2|0x40|0x800|0x8000))              // OVERWRITEPROMPT | FORCEFILESYSTEM | PATHMUSTEXIST | NOREADONLYRETURN
	comCall(dlg, 17, uintptr(unsafe.Pointer(u("Kaydet"))))            // SetTitle
	comCall(dlg, 15, uintptr(unsafe.Pointer(u(filepath.Base(name))))) // SetFileName
	if start != "" {
		if st, err := os.Stat(start); err == nil && st.IsDir() {
			var item uintptr
			if r, _, _ := pSHCreateItemFromPN.Call(uintptr(unsafe.Pointer(u(start))), 0, uintptr(unsafe.Pointer(&iidIShellItem)), uintptr(unsafe.Pointer(&item))); r == 0 && item != 0 {
				comCall(dlg, 12, item) // SetFolder
				comCall(item, 2)
			}
		}
	}
	if comCall(dlg, 3, owner) != 0 { // Show
		return ""
	}
	var item uintptr
	if comCall(dlg, 20, uintptr(unsafe.Pointer(&item))) != 0 || item == 0 { // GetResult
		return ""
	}
	defer comCall(item, 2)
	var ps *uint16
	if comCall(item, 5, 0x80058000, uintptr(unsafe.Pointer(&ps))) != 0 || ps == nil {
		return ""
	}
	defer pCoTaskMemFree.Call(uintptr(unsafe.Pointer(ps)))
	n := 0
	for p := uintptr(unsafe.Pointer(ps)); *(*uint16)(unsafe.Pointer(p)) != 0; p += 2 {
		n++
	}
	return syscall.UTF16ToString(unsafe.Slice(ps, n))
}
