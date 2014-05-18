package main

import (
	"os"

	"code.google.com/p/go.tools/imports"
)

func main() {
	src := []byte(`package main

import (
	"fmt"
	. "launchpad.net/gocheck"
	"strconv"
)

func main() {
	fmt.Println(strconv.Itoa(1))
}
`)

	out, err := imports.Process("", src, nil)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(out)
}
