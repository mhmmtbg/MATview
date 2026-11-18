package main

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// parça parça ekleyerek yazma ve izin dışı yolların reddi
func TestFsBridgeWrite(t *testing.T) {
	b := startFsBridge()
	dir := t.TempDir()
	if !b.allow(dir) {
		t.Fatal("klasöre izin verilmedi")
	}
	p := filepath.Join(dir, "a.mat")
	put := func(path string, a int, body []byte) int {
		u := fmt.Sprintf("http://127.0.0.1:%d/write?t=%s&a=%d&p=%s", b.port, b.token, a, path)
		req, _ := http.NewRequest(http.MethodPut, u, bytes.NewReader(body))
		r, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	big := bytes.Repeat([]byte{7}, 3<<20)
	if put(p, 0, []byte("abc")) != 204 || put(p, 1, big) != 204 || put(p, 1, []byte("z")) != 204 {
		t.Fatal("yazma başarısız")
	}
	got, _ := os.ReadFile(p)
	if len(got) != 3+len(big)+1 || string(got[:3]) != "abc" || got[len(got)-1] != 'z' {
		t.Fatalf("içerik yanlış: %d", len(got))
	}
	rm := func(path string) int {
		r, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/remove?t=%s&p=%s", b.port, b.token, path), "", nil)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	if rm(p) != 204 {
		t.Fatal("silme başarısız")
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("dosya silinmedi")
	}
	if rm(dir) != 204 {
		t.Fatal("klasör isteği")
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatal("klasör silinmemeli")
	}
	if rm(filepath.Join(filepath.Dir(dir), "x")) != 403 {
		t.Fatal("izin dışı silme kabul edildi")
	}
	if put(filepath.Join(filepath.Dir(dir), "x.mat"), 0, []byte("x")) != 403 {
		t.Fatal("izin dışı yol kabul edildi")
	}
}

// MATVIEW_FS_SERVE=<klasör> ile çalıştırılınca yazıcı açık kalır (Playwright uçtan uca testi için): "FS PORT TOKEN" yazar
func TestFsServe(t *testing.T) {
	d := os.Getenv("MATVIEW_FS_SERVE")
	if d == "" {
		t.Skip()
	}
	b := startFsBridge()
	b.allow(d)
	fmt.Printf("FS %d %s\n", b.port, b.token)
	os.Stdout.Sync()
	time.Sleep(10 * time.Minute)
}
