//go:build !windows

package main

// Windows dışında yerel pencere yoktur; tarayıcı uygulama penceresi kullanılır.
func runNative(u, dir string) bool { return false }
