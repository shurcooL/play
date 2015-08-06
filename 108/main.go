// +build darwin

// Play with posting HID events on OS X.
package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#include "main.h"
*/
import "C"

import (
	"fmt"
	"time"

	"github.com/bradfitz/iter"
)

func main() {
	for range iter.N(10) {
		fmt.Println("Posting event.")
		C.postEvent()

		time.Sleep(time.Second)
	}
}
