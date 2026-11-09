package live

import (
	"bufio"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// en küçük WebSocket istemcisi (yalnız test için)
func dial(t *testing.T, s *Server, path string) (net.Conn, *bufio.Reader) {
	c, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", s.Port))
	if err != nil {
		t.Fatal(err)
	}
	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef"))
	fmt.Fprintf(c, "GET %s HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n", path, key)
	br := bufio.NewReader(c)
	resp, err := http.ReadResponse(br, nil)
	if err != nil || resp.StatusCode != 101 {
		t.Fatalf("el sıkışma: %v %v", err, resp)
	}
	return c, br
}

func readMsg(t *testing.T, br *bufio.Reader) (byte, []byte) {
	var hd [2]byte
	if _, err := io.ReadFull(br, hd[:]); err != nil {
		t.Fatal(err)
	}
	n := int(hd[1] & 127)
	if n == 126 {
		var b [2]byte
		io.ReadFull(br, b[:])
		n = int(binary.BigEndian.Uint16(b[:]))
	} else if n == 127 {
		var b [8]byte
		io.ReadFull(br, b[:])
		n = int(binary.BigEndian.Uint64(b[:]))
	}
	p := make([]byte, n)
	io.ReadFull(br, p)
	return hd[0] & 15, p
}

func freeUDPPort(t *testing.T) int {
	pc, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	p := pc.LocalAddr().(*net.UDPAddr).Port
	pc.Close()
	return p
}

func TestUDP(t *testing.T) {
	s, err := Start()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	// anahtarsız istek reddedilir
	if r, _ := http.Get(fmt.Sprintf("http://127.0.0.1:%d/ports", s.Port)); r == nil || r.StatusCode != 403 {
		t.Fatal("anahtarsız erişim reddedilmedi")
	}
	port := freeUDPPort(t)
	c, br := dial(t, s, fmt.Sprintf("/udp?t=%s&port=%d&local=127.0.0.1", s.Token, port))
	defer c.Close()
	op, p := readMsg(t, br)
	if op != 1 || !strings.Contains(string(p), "UDP dinleniyor") {
		t.Fatalf("bilgi mesajı yok: %d %s", op, p)
	}
	out, _ := net.DialUDP("udp", nil, &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: port})
	defer out.Close()
	want := make([]byte, 3000)
	for i := range want {
		want[i] = byte(i * 7)
	}
	for k := 0; k < 5; k++ {
		out.Write(want)
		op, p = readMsg(t, br)
		if op != 2 || len(p) != len(want) || p[100] != want[100] {
			t.Fatalf("paket %d: op %d len %d", k, op, len(p))
		}
	}
	// istenmeyen kaynak süzülür
	c2, br2 := dial(t, s, fmt.Sprintf("/udp?t=%s&port=%d&local=127.0.0.1&src=10.9.9.9", s.Token, freeUDPPort(t)))
	defer c2.Close()
	readMsg(t, br2)
	// geçersiz port → hata mesajı
	c3, br3 := dial(t, s, fmt.Sprintf("/udp?t=%s&port=0", s.Token))
	defer c3.Close()
	if op, p := readMsg(t, br3); op != 1 || !strings.Contains(string(p), "error") {
		t.Fatalf("hata mesajı yok: %s", p)
	}
}

func TestSerialFile(t *testing.T) {
	s, _ := Start()
	defer s.Close()
	f, _ := os.CreateTemp("", "seri")
	f.Write([]byte("EB90abcdef"))
	f.Close()
	defer os.Remove(f.Name())
	c, br := dial(t, s, fmt.Sprintf("/serial?t=%s&com=%s&baud=2000000", s.Token, f.Name()))
	defer c.Close()
	if op, p := readMsg(t, br); op != 1 || !strings.Contains(string(p), "açıldı") {
		t.Fatalf("seri bilgi: %s", p)
	}
	if op, p := readMsg(t, br); op != 2 || string(p) != "EB90abcdef" {
		t.Fatalf("seri veri: %d %q", op, p)
	}
}

// MATVIEW_LIVE_SERVE=1 ile çalıştırılınca sunucu açık kalır (Playwright uçtan uca testi için): "PORT TOKEN" yazar
func TestServe(t *testing.T) {
	if os.Getenv("MATVIEW_LIVE_SERVE") == "" {
		t.Skip()
	}
	s, _ := Start()
	fmt.Printf("LIVE %d %s\n", s.Port, s.Token)
	os.Stdout.Sync()
	time.Sleep(10 * time.Minute)
}
