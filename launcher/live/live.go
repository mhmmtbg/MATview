// Package live: MATView.exe içinde canlı telemetri kaynakları (UDP ve seri port).
//
// Tarayıcı UDP soketi açamaz; telemetryParser bunun için ayrı bir PowerShell köprüsü kullanır. MATView.exe bu işi
// kendi içinde yapar: 127.0.0.1 üzerinde, yalnız sayfanın bildiği bir anahtarla çalışan küçük bir WebSocket sunucusu
// UDP paketlerini ve seri port byte'larını sayfaya ikili (binary) mesaj olarak iletir. İleti biçimi telemetryParser
// v4.8 UDP köprüsüyle aynıdır: ikili mesaj = ham veri, metin mesaj = {"type":"info"|"error","msg":"…"}.
package live

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Server: canlı veri köprüsü
type Server struct {
	Port  int
	Token string
	ln    net.Listener
}

// Start: 127.0.0.1 üzerinde rastgele bir portta dinlemeye başlar.
func Start() (*Server, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	k := make([]byte, 24)
	if _, err := rand.Read(k); err != nil {
		ln.Close()
		return nil, err
	}
	s := &Server{Port: ln.Addr().(*net.TCPAddr).Port, Token: hex.EncodeToString(k), ln: ln}
	go http.Serve(ln, s)
	return s, nil
}

// Close: dinlemeyi durdurur.
func (s *Server) Close() { s.ln.Close() }

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Private-Network", "true")
	q := r.URL.Query()
	if q.Get("t") != s.Token {
		http.Error(w, "yetkisiz", http.StatusForbidden)
		return
	}
	switch r.URL.Path {
	case "/ports":
		ports, err := SerialPorts()
		if err != nil || ports == nil {
			ports = []string{}
		}
		h.Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ports)
	case "/udp":
		ws, err := accept(w, r)
		if err != nil {
			return
		}
		serveUDP(ws, q)
	case "/serial":
		ws, err := accept(w, r)
		if err != nil {
			return
		}
		serveSerial(ws, q)
	default:
		http.NotFound(w, r)
	}
}

/* ---------------- en küçük WebSocket sunucusu (RFC 6455) ---------------- */

type wsConn struct {
	c      net.Conn
	br     *bufio.Reader
	mu     sync.Mutex
	closed chan struct{}
	once   sync.Once
}

func accept(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "WebSocket bekleniyor", http.StatusBadRequest)
		return nil, errors.New("upgrade yok")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	hj, ok := w.(http.Hijacker)
	if !ok || key == "" {
		http.Error(w, "WebSocket kurulamadı", http.StatusInternalServerError)
		return nil, errors.New("hijack yok")
	}
	c, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	resp := "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + base64.StdEncoding.EncodeToString(sum[:]) + "\r\n\r\n"
	if _, err := c.Write([]byte(resp)); err != nil {
		c.Close()
		return nil, err
	}
	ws := &wsConn{c: c, br: brw.Reader, closed: make(chan struct{})}
	go ws.readLoop()
	return ws, nil
}

// istemciden gelen çerçeveler: yalnız kapatma ve ping işlenir
func (ws *wsConn) readLoop() {
	defer ws.Close()
	for {
		var hd [2]byte
		if _, err := io.ReadFull(ws.br, hd[:]); err != nil {
			return
		}
		op, n := hd[0]&15, int64(hd[1]&127)
		if n == 126 {
			var b [2]byte
			if _, err := io.ReadFull(ws.br, b[:]); err != nil {
				return
			}
			n = int64(binary.BigEndian.Uint16(b[:]))
		} else if n == 127 {
			var b [8]byte
			if _, err := io.ReadFull(ws.br, b[:]); err != nil {
				return
			}
			n = int64(binary.BigEndian.Uint64(b[:]))
		}
		var mask [4]byte
		if hd[1]&128 != 0 {
			if _, err := io.ReadFull(ws.br, mask[:]); err != nil {
				return
			}
		}
		if n > 1<<20 {
			return
		}
		p := make([]byte, n)
		if _, err := io.ReadFull(ws.br, p); err != nil {
			return
		}
		for i := range p {
			p[i] ^= mask[i&3]
		}
		switch op {
		case 8:
			ws.write(8, nil)
			return
		case 9:
			ws.write(10, p)
		}
	}
}

func (ws *wsConn) write(op byte, p []byte) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	hd := []byte{0x80 | op}
	n := len(p)
	switch {
	case n < 126:
		hd = append(hd, byte(n))
	case n < 65536:
		hd = append(hd, 126, byte(n>>8), byte(n))
	default:
		hd = append(hd, 127, 0, 0, 0, 0, byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	ws.c.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := ws.c.Write(hd); err != nil {
		return err
	}
	_, err := ws.c.Write(p)
	return err
}

func (ws *wsConn) Binary(p []byte) error { return ws.write(2, p) }
func (ws *wsConn) Text(kind, msg string) error {
	b, _ := json.Marshal(map[string]string{"type": kind, "msg": msg})
	return ws.write(1, b)
}
func (ws *wsConn) Close() {
	ws.once.Do(func() { close(ws.closed); ws.c.Close() })
}

/* ---------------- UDP ---------------- */

func serveUDP(ws *wsConn, q map[string][]string) {
	defer ws.Close()
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return strings.TrimSpace(v[0])
		}
		return ""
	}
	port, _ := strconv.Atoi(get("port"))
	if port < 1 || port > 65535 {
		ws.Text("error", "Geçersiz UDP portu: "+get("port"))
		return
	}
	local, src, mcast := get("local"), get("src"), get("mcast")
	var pc *net.UDPConn
	var err error
	if mcast != "" {
		ip := net.ParseIP(mcast)
		if ip == nil || !ip.IsMulticast() {
			ws.Text("error", "Geçersiz multicast adresi: "+mcast)
			return
		}
		var ifi *net.Interface
		if local != "" {
			ifi = ifaceOf(local)
		}
		pc, err = net.ListenMulticastUDP("udp4", ifi, &net.UDPAddr{IP: ip, Port: port})
	} else {
		addr := &net.UDPAddr{Port: port}
		if local != "" {
			addr.IP = net.ParseIP(local)
			if addr.IP == nil {
				ws.Text("error", "Geçersiz yerel IP adresi: "+local)
				return
			}
		}
		pc, err = net.ListenUDP("udp", addr)
	}
	if err != nil {
		ws.Text("error", "UDP portu açılamadı ("+strconv.Itoa(port)+"): "+err.Error()+" — port başka bir program tarafından kullanılıyor olabilir.")
		return
	}
	defer pc.Close()
	pc.SetReadBuffer(8 << 20)
	where := "tüm arayüzler"
	if local != "" {
		where = local
	}
	info := fmt.Sprintf("UDP dinleniyor: %s:%d", where, port)
	if src != "" {
		info += " · yalnız kaynak " + src
	}
	if mcast != "" {
		info += " · multicast " + mcast
	}
	ws.Text("info", info)
	go func() { <-ws.closed; pc.Close() }()
	buf := make([]byte, 65536)
	var srcIP net.IP
	if src != "" {
		srcIP = net.ParseIP(src)
	}
	for {
		n, ra, err := pc.ReadFromUDP(buf)
		if err != nil {
			select {
			case <-ws.closed:
			default:
				ws.Text("error", "UDP okuma hatası: "+err.Error())
			}
			return
		}
		if srcIP != nil && !ra.IP.Equal(srcIP) {
			continue
		}
		if ws.Binary(buf[:n]) != nil {
			return
		}
	}
}

func ifaceOf(ip string) *net.Interface {
	want := net.ParseIP(ip)
	ifs, _ := net.Interfaces()
	for i := range ifs {
		addrs, _ := ifs[i].Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.Equal(want) {
				return &ifs[i]
			}
		}
	}
	return nil
}

/* ---------------- seri port ---------------- */

// SerialConfig: seri port ayarları (telemetryParser live.serial ile aynı adlar)
type SerialConfig struct {
	Name     string
	Baud     int
	DataBits int
	Parity   string // none | even | odd
	StopBits int    // 1 | 2
	Flow     string // none | hardware
}

func serveSerial(ws *wsConn, q map[string][]string) {
	defer ws.Close()
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return strings.TrimSpace(v[0])
		}
		return ""
	}
	atoi := func(k string, d int) int {
		if v, err := strconv.Atoi(get(k)); err == nil {
			return v
		}
		return d
	}
	cfg := SerialConfig{Name: get("com"), Baud: atoi("baud", 115200), DataBits: atoi("dataBits", 8), Parity: get("parity"), StopBits: atoi("stopBits", 1), Flow: get("flow")}
	if cfg.Name == "" {
		ws.Text("error", "Seri port seçilmedi")
		return
	}
	port, err := OpenSerial(cfg)
	if err != nil {
		ws.Text("error", cfg.Name+" açılamadı: "+err.Error())
		return
	}
	defer port.Close()
	pl := "N"
	switch cfg.Parity {
	case "even":
		pl = "E"
	case "odd":
		pl = "O"
	}
	ws.Text("info", fmt.Sprintf("%s açıldı · %d baud · %d%s%d", cfg.Name, cfg.Baud, cfg.DataBits, pl, cfg.StopBits))
	go func() { <-ws.closed; port.Close() }()
	buf := make([]byte, 1<<16)
	for {
		n, err := port.Read(buf)
		if n > 0 {
			if ws.Binary(buf[:n]) != nil {
				return
			}
		}
		if err != nil {
			select {
			case <-ws.closed:
			default:
				ws.Text("error", cfg.Name+" okuma hatası: "+err.Error())
			}
			return
		}
	}
}
