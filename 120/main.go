// Play with "testing/quick" package to find an input that causes html.Parse to return an error.
//
// It seems to never happen, likely because html.Parse only returns errors when they are caused by running out of memory
// or supplied io.Reader misbehaving. Neither can happen via html.Parse(bytes.NewReader()).
package main

import (
	"bytes"
	"fmt"
	"math/rand"
	"strings"
	"testing/quick"
	"time"
	"unicode/utf8"

	"golang.org/x/net/html"
)

func main() {
	f := func(x []byte) bool {
		_, err := html.Parse(bytes.NewReader(x))
		if err != nil {
			fmt.Printf("input: %q\nerr: %v\n", x, err)
			return false
		}
		return true
	}
	err := quick.Check(f,
		&quick.Config{
			MaxCount: 100000000,
			Rand:     rand.New(rand.NewSource(time.Now().UnixNano())),
		})
	fmt.Println("Check:", err)
}

func mainB() {
	in := "<a href\\x/&>  \\xF0\\x82\\x82\\ xAC90543654<\a> what"

	_, err := html.Parse(strings.NewReader(in))
	fmt.Println(err)

	valid := utf8.ValidString(in)
	fmt.Println(valid)

	// Output:
	// <nil>
	// false
}
