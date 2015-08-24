// +build js

// Learn about https://github.com/gopherjs/gopherjs/issues/275.
package main

import (
	"github.com/gopherjs/gopherjs/js"
	"honnef.co/go/js/console"
)

func main() {
	result := nothing()
	console.Log(result)
	if result == nil {
		console.Log("result is nil")
	}
	if result != nil {
		console.Log("result is not nil")
	}
	if result.Object == nil {
		console.Log("result.Object is nil")
	}
	if result.Object != nil {
		console.Log("result.Object is not nil")
	}
}

func nothing() *js.Error {
	c := make(chan *js.Error)
	go func() {
		js.Global.Get("foo").Call("nothing_js", func(err *js.Error) {
			c <- err
		})
	}()
	return <-c
}
