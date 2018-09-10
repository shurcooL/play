// +build js,wasm

package main

import (
	"fmt"
	"syscall/js"
)

func main() {
	es := js.Global().Get("EventSource").New("http://localhost:8090/sse")
	es.Call("addEventListener", "message", js.NewEventCallback(0, func(event js.Value) {
		data := event.Get("data").String()
		fmt.Println(data)
	}))
	select {}
}
