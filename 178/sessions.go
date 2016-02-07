package main

import (
	"crypto/rand"
	"sync"
)

var sessions struct {
	mu       sync.Mutex
	sessions map[string]string // Access Token -> Username.
}

func init() {
	sessions.sessions = make(map[string]string)
}

func newAccessToken() string {
	b := make([]byte, 256)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	return string(b)
}
