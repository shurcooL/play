// +build js

// Work with https://github.com/gopherjs/gopherjs/issues/279.
package main

import (
	"time"

	"github.com/gopherjs/gopherjs/js"
)

//var _ = time.Now()

func log(i ...interface{}) {
	js.Global.Get("console").Call("log", i...)

	//var now = js.Global.Get("Date").New()

	//js.Global.Get("console").Call("log", now)

	//_ = now.Interface()

	//fmt.Printf("%T: %v\n", now.Interface(), now.Interface())
}

type Test struct {
	A int
	B string
}

func main() {
	log(Test{1, "hello"})
	time.Sleep(time.Second)
}
