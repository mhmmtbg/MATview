package main

// Yerel dosya yazıcı (platformdan bağımsız kısım): 127.0.0.1 üzerinde, yalnız sayfanın bildiği bir anahtarla çalışır;
// yalnız izin verilen (kullanıcının Windows penceresinde seçtiği) klasörlerin altına yazar. Büyük çıktılar parça parça
// eklenerek (a=1) belleğe alınmadan yazılır.

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
)

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
		_, err = io.CopyBuffer(struct{ io.Writer }{f}, r.Body, make([]byte, 1<<20))
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "/remove":
		// iptal edilen yazımın yarım kalan dosyası: yalnız dosya (klasör değil) ve yalnız izinli klasörlerin içinde
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if err := os.Remove(p); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
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
