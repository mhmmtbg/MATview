//go:build windows

package live

import (
	"errors"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	advapi32         = syscall.NewLazyDLL("advapi32.dll")
	pGetCommState    = kernel32.NewProc("GetCommState")
	pSetCommState    = kernel32.NewProc("SetCommState")
	pSetCommTimeouts = kernel32.NewProc("SetCommTimeouts")
	pSetupComm       = kernel32.NewProc("SetupComm")
	pPurgeComm       = kernel32.NewProc("PurgeComm")
	pClearCommError  = kernel32.NewProc("ClearCommError")
	pRegOpenKeyExW   = advapi32.NewProc("RegOpenKeyExW")
	pRegEnumValueW   = advapi32.NewProc("RegEnumValueW")
	pRegCloseKey     = advapi32.NewProc("RegCloseKey")
)

// DCB (winbase.h), 28 byte
type dcb struct {
	DCBlength  uint32
	BaudRate   uint32
	Flags      uint32
	wReserved  uint16
	XonLim     uint16
	XoffLim    uint16
	ByteSize   byte
	Parity     byte
	StopBits   byte
	XonChar    byte
	XoffChar   byte
	ErrorChar  byte
	EofChar    byte
	EvtChar    byte
	wReserved1 uint16
}

type commTimeouts struct {
	ReadIntervalTimeout         uint32
	ReadTotalTimeoutMultiplier  uint32
	ReadTotalTimeoutConstant    uint32
	WriteTotalTimeoutMultiplier uint32
	WriteTotalTimeoutConstant   uint32
}

// SerialPorts: kayıt defterindeki COM portları (HKLM\HARDWARE\DEVICEMAP\SERIALCOMM)
func SerialPorts() ([]string, error) {
	const hklm = 0x80000002
	var key syscall.Handle
	path, _ := syscall.UTF16PtrFromString(`HARDWARE\DEVICEMAP\SERIALCOMM`)
	if r, _, _ := pRegOpenKeyExW.Call(hklm, uintptr(unsafe.Pointer(path)), 0, 0x20019 /*KEY_READ*/, uintptr(unsafe.Pointer(&key))); r != 0 {
		return []string{}, nil // hiç seri port yoksa anahtar da yoktur
	}
	defer pRegCloseKey.Call(uintptr(key))
	var out []string
	for i := uint32(0); i < 256; i++ {
		name := make([]uint16, 256)
		data := make([]uint16, 256)
		nl, dl, typ := uint32(len(name)), uint32(len(data)*2), uint32(0)
		r, _, _ := pRegEnumValueW.Call(uintptr(key), uintptr(i), uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&nl)), 0, uintptr(unsafe.Pointer(&typ)), uintptr(unsafe.Pointer(&data[0])), uintptr(unsafe.Pointer(&dl)))
		if r != 0 {
			break
		}
		if typ == 1 { // REG_SZ
			out = append(out, syscall.UTF16ToString(data))
		}
	}
	num := func(s string) int { n, _ := strconv.Atoi(strings.TrimPrefix(strings.ToUpper(s), "COM")); return n }
	sort.Slice(out, func(a, b int) bool { return num(out[a]) < num(out[b]) })
	return out, nil
}

type winSerial struct {
	h    syscall.Handle
	mu   sync.Mutex
	done bool
}

// OpenSerial: COM portunu verilen ayarlarla açar. Okuma en çok 50 ms bekler (gelen byte'lar hemen döner).
func OpenSerial(c SerialConfig) (io.ReadCloser, error) {
	name := strings.ToUpper(strings.TrimSpace(c.Name))
	if !strings.HasPrefix(name, `\\.\`) {
		name = `\\.\` + name
	}
	p, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(p, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_EXISTING, 0, 0)
	if err != nil {
		if errors.Is(err, syscall.ERROR_ACCESS_DENIED) {
			return nil, errors.New("port başka bir program tarafından kullanılıyor")
		}
		if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) {
			return nil, errors.New("port bulunamadı (cihaz takılı mı?)")
		}
		return nil, err
	}
	fail := func(what string, e error) (io.ReadCloser, error) {
		syscall.CloseHandle(h)
		return nil, errors.New(what + ": " + e.Error())
	}
	pSetupComm.Call(uintptr(h), 1<<20, 1<<16)
	d := dcb{DCBlength: uint32(unsafe.Sizeof(dcb{}))}
	if r, _, e := pGetCommState.Call(uintptr(h), uintptr(unsafe.Pointer(&d))); r == 0 {
		return fail("port durumu okunamadı", e)
	}
	d.BaudRate = uint32(c.Baud)
	if c.DataBits >= 5 && c.DataBits <= 8 {
		d.ByteSize = byte(c.DataBits)
	} else {
		d.ByteSize = 8
	}
	switch strings.ToLower(c.Parity) {
	case "odd":
		d.Parity = 1
	case "even":
		d.Parity = 2
	case "mark":
		d.Parity = 3
	case "space":
		d.Parity = 4
	default:
		d.Parity = 0
	}
	if c.StopBits == 2 {
		d.StopBits = 2
	} else {
		d.StopBits = 0
	}
	// fBinary | fParity (eşlik varsa) | DTR açık; akış denetimi: donanım (CTS/RTS) ya da RTS açık
	flags := uint32(1)
	if d.Parity != 0 {
		flags |= 1 << 1
	}
	flags |= 1 << 4 // fDtrControl = DTR_CONTROL_ENABLE
	if strings.ToLower(c.Flow) == "hardware" {
		flags |= 1 << 2  // fOutxCtsFlow
		flags |= 2 << 12 // fRtsControl = RTS_CONTROL_HANDSHAKE
	} else {
		flags |= 1 << 12 // RTS_CONTROL_ENABLE
	}
	d.Flags = flags
	if r, _, e := pSetCommState.Call(uintptr(h), uintptr(unsafe.Pointer(&d))); r == 0 {
		return fail("port ayarları uygulanamadı (baud / biçim desteklenmiyor olabilir)", e)
	}
	to := commTimeouts{ReadIntervalTimeout: 0xFFFFFFFF, ReadTotalTimeoutMultiplier: 0xFFFFFFFF, ReadTotalTimeoutConstant: 50}
	if r, _, e := pSetCommTimeouts.Call(uintptr(h), uintptr(unsafe.Pointer(&to))); r == 0 {
		return fail("zaman aşımı ayarlanamadı", e)
	}
	pPurgeComm.Call(uintptr(h), 0x0008|0x0002) // PURGE_RXCLEAR | PURGE_RXABORT
	return &winSerial{h: h}, nil
}

func (s *winSerial) Read(b []byte) (int, error) {
	for {
		s.mu.Lock()
		done := s.done
		s.mu.Unlock()
		if done {
			return 0, io.EOF
		}
		var n uint32
		err := syscall.ReadFile(s.h, b, &n, nil)
		if err != nil {
			var errs uint32
			pClearCommError.Call(uintptr(s.h), uintptr(unsafe.Pointer(&errs)), 0)
			return int(n), err
		}
		if n > 0 {
			return int(n), nil
		}
	}
}

func (s *winSerial) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.done {
		return nil
	}
	s.done = true
	return syscall.CloseHandle(s.h)
}
