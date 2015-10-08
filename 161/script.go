// +build js

package main

import (
	"github.com/gopherjs/gopherjs/js"
)

func main() {
	js.Global.Get("document").Call("write", "[GopherJS] text works, but 😀 fails")
}

/*
package main

import "fmt"

func main() {
	in := 128512

	fmt.Printf(`\u{%X}`, in)

	// Output: \u{1F600}
}
*/
