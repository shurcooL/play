// main yea neat.
// main and main what main main is is going on? many many many main but not main

//go:generate go run gen.go

package main

import (
	"strings"

	"github.com/shurcooL/go-goon"
)

func main() {
	p, ip := "github.com/shurcooL/go", "github.com/shurcooL/go/u/u10"
	p, ip = "github.com/shurcooL/go", "github.com/shurcooL/go"
	_, _ = p, ip

	elements := append([]string{p}, strings.Split(ip[len(p):], "/")[1:]...)

	goon.Dump(elements)
}
