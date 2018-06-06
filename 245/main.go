// Play with Metal API to get system default device name.
package main

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework Foundation -framework Metal
#include "main.h"
*/
import "C"

func main() {
	C.run()
}
