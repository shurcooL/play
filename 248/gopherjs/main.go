// +build js,!wasm

package main

import (
	"fmt"

	"github.com/gopherjs/eventsource"
	"github.com/gopherjs/gopherjs/js"
)

func main() {
	es := eventsource.New("http://localhost:8090/sse")
	es.AddEventListener("message", false, func(event *js.Object) {
		data := event.Get("data").String()
		fmt.Println(data)
	})
}
