// MATView başlatıcı: yerleşik arayüzü yerel bir sunucuda yayınlar, Edge/Chrome'u uygulama penceresi olarak açar.
// Kurulum gerektirmez; ağ erişimi yalnızca 127.0.0.1 (bu bilgisayar) ile sınırlıdır.
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed matview.html
var page []byte

func findBrowser() string {
	var c []string
	if runtime.GOOS == "windows" {
		pf, pf86, lad := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
		for _, base := range []string{pf86, pf, lad} {
			if base == "" {
				continue
			}
			c = append(c, filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`), filepath.Join(base, `Google\Chrome\Application\chrome.exe`))
		}
	} else {
		for _, n := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
			if p, err := exec.LookPath(n); err == nil {
				c = append(c, p)
			}
		}
	}
	for _, p := range c {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func main() {
	var files []string
	noBrowser := false
	for _, a := range os.Args[1:] {
		if a == "-nobrowser" {
			noBrowser = true
			continue
		}
		if abs, err := filepath.Abs(a); err == nil {
			if st, err := os.Stat(abs); err == nil && !st.IsDir() {
				files = append(files, abs)
			}
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, "Sunucu başlatılamadı:", err)
		os.Exit(1)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	var lastPing, byeAt atomic.Int64
	var seen atomic.Bool
	lastPing.Store(time.Now().UnixNano())

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(page)
	})
	mux.HandleFunc("/api/args", func(w http.ResponseWriter, r *http.Request) {
		names := make([]string, len(files))
		for i, f := range files {
			names[i] = filepath.Base(f)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(names)
	})
	mux.HandleFunc("/api/file/", func(w http.ResponseWriter, r *http.Request) {
		i, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/api/file/"))
		if err != nil || i < 0 || i >= len(files) {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, files[i])
	})
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().UnixNano())
		seen.Store(true)
		w.WriteHeader(204)
	})
	mux.HandleFunc("/api/bye", func(w http.ResponseWriter, r *http.Request) {
		byeAt.Store(time.Now().UnixNano())
		w.WriteHeader(204)
	})
	go http.Serve(ln, mux)

	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	if noBrowser {
		fmt.Println(url)
		select {}
	}
	done := make(chan struct{})
	if b := findBrowser(); b != "" {
		profile := filepath.Join(os.TempDir(), "MATView-profile")
		cmd := exec.Command(b, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check",
			"--window-size=1500,920", "--disable-features=Translate")
		if err := cmd.Start(); err == nil {
			go func() { cmd.Wait(); close(done) }()
		}
	} else if runtime.GOOS == "windows" {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	} else {
		exec.Command("xdg-open", url).Start()
	}
	// Tarayıcı sahibi değilsek: pencere kapanınca (bye) veya uzun süre sinyal gelmezse çık.
	start := time.Now()
	for {
		select {
		case <-done:
			return
		case <-time.After(1 * time.Second):
		}
		now := time.Now().UnixNano()
		bye := byeAt.Load()
		if bye != 0 && bye > lastPing.Load() && now-bye > int64(4*time.Second) {
			return
		}
		if !seen.Load() && time.Since(start) > 2*time.Minute {
			return
		}
	}
}
