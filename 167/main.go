package main

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
)

func main() {
	fmt.Println(storageSafePath("/foo%/../bar/"))
}

func storageSafePath(p string) string {
	e := strings.Split(p, "/")
	for i := 0; i < len(e); i++ {
		switch e[i] {
		default:
			e[i] = url.QueryEscape(e[i])
		case ".":
			e[i] = "dot"
		case "..":
			e[i] = "dotdot"
		}
	}
	return filepath.Join(e...)
}
