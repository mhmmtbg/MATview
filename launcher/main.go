// MATView başlatıcı: yerleşik arayüzü geçici klasöre yazar ve Edge/Chrome'u uygulama penceresi olarak açar.
// Sunucu yoktur, ağ kullanılmaz; kurulum gerektirmez.
// Sol paneldeki "Klasör" görünümünün yazılan yoldan (C:\Veri, \\sunucu\paylasim) okuyabilmesi için tarayıcı
// --allow-file-access-from-files ile açılır (yalnızca MATView'a ayrılmış profilde). Exe'ye bırakılan dosyalar
// ve klasörler adresin sonuna #cwd=…&open=… olarak eklenir.
package main

import (
	_ "embed"
	"net/url"
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
	u := "file:///" + strings.TrimPrefix(filepath.ToSlash(html), "/")
	if h := hashArgs(os.Args[1:]); h != "" {
		u += "#" + h
	}
	if b := findBrowser(); b != "" {
		cmd := exec.Command(b, "--app="+u, "--user-data-dir="+filepath.Join(dir, "profile"), "--no-first-run", "--no-default-browser-check",
			"--window-size=1500,920", "--disable-features=Translate", "--enable-features=SharedArrayBuffer", "--allow-file-access-from-files")
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

// hashArgs: exe'ye bırakılan dosyalar açılır, ilk dosyanın klasörü (ya da bırakılan klasör) çalışma klasörü olur.
func hashArgs(args []string) string {
	var files []string
	cwd := ""
	for _, a := range args {
		p, err := filepath.Abs(a)
		if err != nil {
			continue
		}
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		if st.IsDir() {
			if cwd == "" {
				cwd = p
			}
			continue
		}
		files = append(files, p)
		if cwd == "" {
			cwd = filepath.Dir(p)
		}
	}
	if cwd == "" && len(files) == 0 {
		return ""
	}
	q := url.Values{}
	if cwd != "" {
		q.Set("cwd", cwd)
	}
	if len(files) > 0 {
		q.Set("open", strings.Join(files, "\n"))
	}
	return q.Encode()
}
