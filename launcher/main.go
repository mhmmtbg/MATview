// MATView başlatıcı: yerleşik arayüzü geçici klasöre yazar ve Edge/Chrome'u uygulama penceresi olarak açar.
// Sunucu yoktur, ağ kullanılmaz; kurulum gerektirmez.
package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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
	dir := filepath.Join(os.TempDir(), "MATView-app")
	os.MkdirAll(dir, 0o755)
	html := filepath.Join(dir, "matview.html")
	if err := os.WriteFile(html, page, 0o644); err != nil {
		os.Exit(1)
	}
	url := "file:///" + strings.TrimPrefix(filepath.ToSlash(html), "/")
	if b := findBrowser(); b != "" {
		cmd := exec.Command(b, "--app="+url, "--user-data-dir="+filepath.Join(dir, "profile"), "--no-first-run", "--no-default-browser-check",
			"--window-size=1500,920", "--disable-features=Translate")
		if cmd.Start() == nil {
			return
		}
	}
	if runtime.GOOS == "windows" {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", html).Start()
	} else {
		exec.Command("xdg-open", html).Start()
	}
}
