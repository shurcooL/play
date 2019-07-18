// +build !wasm

package main

import (
	"testing"

	"github.com/gopherjs/gopherjs/js"
)

const WasmOrGJS = "GopherJS"

func BenchmarkGoGopherJS(b *testing.B) {
	var total float64
	for i := 0; i < b.N; i++ {
		total = 0
		divs := js.Global.Get("document").Call("getElementsByTagName", "div")
		for j := 0; j < divs.Length(); j++ {
			total += divs.Index(j).Call("getBoundingClientRect").Get("top").Float()
		}
	}
	_ = total
}
