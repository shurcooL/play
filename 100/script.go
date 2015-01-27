// +build js

package main

import (
	"github.com/gopherjs/gopherjs/js"
	"honnef.co/go/js/xhr"
)

func main() {
	req := xhr.NewRequest("POST", "http://localhost:8081/binary")
	req.ResponseType = xhr.ArrayBuffer

	// Some bytes I want to send unmodified.
	var msg string = "ab\xFE\xFFAB"

	switch 2 {
	case 0:
		err := req.Send(msg)
		if err != nil {
			panic(err)
		}
		// Server receives:
		// body: [97 98 239 191 189 239 191 189 65 66] len: 10
	case 1:
		arrayBuffer := js.NewArrayBuffer([]byte(msg))
		err := req.Send(arrayBuffer)
		if err != nil {
			panic(err)
		}
		// Server receives:
		// body: [97 98 254 255 65 66] len: 6
	case 2:
		err := req.Send([]byte(msg))
		if err != nil {
			panic(err)
		}
		// Server receives:
		// body: [97 98 254 255 65 66] len: 6
	}
}
