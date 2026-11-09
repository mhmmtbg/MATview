//go:build !windows

package live

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
)

// Windows dışında (geliştirme / test): seri port yerine Name ile verilen dosya ya da adlandırılmış boru okunur.
func SerialPorts() ([]string, error) {
	m, _ := filepath.Glob("/dev/ttyUSB*")
	m2, _ := filepath.Glob("/dev/ttyACM*")
	m = append(m, m2...)
	sort.Strings(m)
	return m, nil
}

func OpenSerial(c SerialConfig) (io.ReadCloser, error) {
	if c.Name == "" {
		return nil, errors.New("port adı boş")
	}
	return os.Open(c.Name)
}
