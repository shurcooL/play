package main

import (
	"crypto/rand"
	"sync"
)

var sessions struct {
	mu       sync.Mutex
	sessions map[string]user // Access Token -> User.
}

func init() {
	sessions.sessions = make(map[string]user)
}

func cryptoRandBytes() []byte {
	b := make([]byte, 256)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	return b
}
