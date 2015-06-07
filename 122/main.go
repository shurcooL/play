// Play with tests for GopherJS handling of js.Undefined (https://github.com/gopherjs/gopherjs/issues/237).
package main

import (
	"fmt"

	"github.com/gopherjs/gopherjs/js"
)

func foo(x interface{}) {
	fmt.Println("x:", x)
	fmt.Println("x == nil:", x == nil)
	fmt.Println("x == js.Undefined:", x == js.Undefined)
}

func main() {
	fmt.Println("(interface{})(nil) == (interface{})(nil):", (interface{})(nil) == (interface{})(nil))
	fmt.Println("js.Undefined == js.Undefined:", js.Undefined == js.Undefined)
	var ui interface{} = js.Undefined
	fmt.Println("ui == js.Undefined:", ui == js.Undefined)
	var u = js.Undefined
	fmt.Println("u == js.Undefined:", u == js.Undefined)
	fmt.Println("u == ui:", u == ui)
	fmt.Println("(interface{})(nil) == js.Undefined:", (interface{})(nil) == js.Undefined)
	fmt.Println("(interface{})(nil) == ui:", (interface{})(nil) == ui)
	fmt.Println("(interface{})(nil) == u:", (interface{})(nil) == u)

	if js.Global != nil {
		fmt.Println()

		type S struct{ *js.Object }
		o1 := js.Global.Get("Object").New()
		o2 := js.Global.Get("Object").New()
		a := S{o1}
		b := S{o1}
		c := S{o2}
		if a != b {
			panic("a != b")
		}
		if a == c {
			panic("a == c")
		}
	}

	fmt.Println()

	foo(nil)
	foo(js.Undefined)

	if js.Global != nil {
		fmt.Println()

		js.Global.Set("foo", foo)
		js.Global.Call("eval", "(foo(null))")
		js.Global.Call("eval", "(foo(undefined))")
	}

	// Output:
	// (interface{})(nil) == (interface{})(nil): true
	// js.Undefined == js.Undefined: true
	// ui == js.Undefined: true
	// u == js.Undefined: true
	// u == ui: true
	// (interface{})(nil) == js.Undefined: false
	// (interface{})(nil) == ui: false
	// (interface{})(nil) == u: false
	//
	// x: <nil>
	// x == nil: true
	// x == js.Undefined: false
	// x: undefined
	// x == nil: false
	// x == js.Undefined: true
}
