//go:build windows

package main

// Yerel uygulama penceresi: Microsoft Edge WebView2 (Windows 10/11 ile gelir, kurulum gerektirmez).
// Pencere büyütülmüş açılır; F11 (sayfadaki kısayol → mvFullscreen) gerçek tam ekran ile pencere arasında geçer.
// Çalışma zamanı bulunamazsa ya da pencere oluşturulamazsa false döner ve tarayıcı uygulama penceresine düşülür.

import (
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	pShowWindow      = user32.NewProc("ShowWindow")
	pGetWindowLongW  = user32.NewProc("GetWindowLongW")
	pSetWindowLongW  = user32.NewProc("SetWindowLongW")
	pSetWindowPos    = user32.NewProc("SetWindowPos")
	pMonitorFromWnd  = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW = user32.NewProc("GetMonitorInfoW")
	pGetWindowRect   = user32.NewProc("GetWindowRect")
	pIsZoomed        = user32.NewProc("IsZoomed")
)

const (
	gwlStyle           = ^uintptr(15) // GWL_STYLE = -16
	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	swMaximize         = 3
	swRestore          = 9
	swpNoZOrder        = 0x0004
	swpFrameChanged    = 0x0020
	swpNoOwnerZOrder   = 0x0200
	monitorNearest     = 2
)

type rect struct{ L, T, R, B int32 }
type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

func runNative(u, dir string) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	if v, err := webviewloader.GetInstalledVersion(); err != nil || v == "" {
		return false
	}
	// sayfa file:// üzerinden klasör okuyabilsin (Klasör paneli, yol yazarak açma)
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--allow-file-access-from-files --disable-features=Translate")
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "MATView", "WebView2")
	if os.Getenv("LOCALAPPDATA") == "" {
		data = filepath.Join(dir, "webview2")
	}
	os.MkdirAll(data, 0o755)
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  data,
		WindowOptions: webview2.WindowOptions{
			Title:  "MATView",
			Width:  1500,
			Height: 920,
			IconId: 2, // rsrc: manifest 1, simge grubu 2
			Center: true,
		},
	})
	if w == nil {
		return false
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())
	pShowWindow.Call(hwnd, swMaximize)

	var full bool
	var saved rect
	var savedZoom uintptr
	w.Bind("mvFullscreen", func(on bool) bool {
		if on == full {
			return full
		}
		if on {
			savedZoom, _, _ = pIsZoomed.Call(hwnd)
			pGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&saved)))
			style, _, _ := pGetWindowLongW.Call(hwnd, gwlStyle)
			pSetWindowLongW.Call(hwnd, gwlStyle, style&^wsOverlappedWindow|wsVisible)
			mon, _, _ := pMonitorFromWnd.Call(hwnd, monitorNearest)
			mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
			pGetMonitorInfoW.Call(mon, uintptr(unsafe.Pointer(&mi)))
			m := mi.Monitor
			pSetWindowPos.Call(hwnd, 0, uintptr(m.L), uintptr(m.T), uintptr(m.R-m.L), uintptr(m.B-m.T), swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
		} else {
			style, _, _ := pGetWindowLongW.Call(hwnd, gwlStyle)
			pSetWindowLongW.Call(hwnd, gwlStyle, style|wsOverlappedWindow)
			pSetWindowPos.Call(hwnd, 0, uintptr(saved.L), uintptr(saved.T), uintptr(saved.R-saved.L), uintptr(saved.B-saved.T), swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
			if savedZoom != 0 {
				pShowWindow.Call(hwnd, swMaximize)
			}
		}
		full = on
		return full
	})
	w.Init("window.__MATVIEW_NATIVE__ = true;")
	w.SetTitle("MATView")
	w.Navigate(u)
	w.Run()
	return true
}
