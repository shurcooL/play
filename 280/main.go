// Play with printing the value of maximumPotentialExtendedDynamicRangeColorComponentValue.
package main

import (
	"fmt"
	"log"
	"runtime"

	"github.com/go-gl/glfw/v3.3/glfw"
)

func init() { runtime.LockOSThread() }

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	err := glfw.Init()
	if err != nil {
		return err
	}
	defer glfw.Terminate()

	glfw.WindowHint(glfw.ClientAPI, glfw.NoAPI)
	window, err := glfw.CreateWindow(640, 480, "", nil, nil)
	if err != nil {
		return err
	}

	screen := NewWindow(window.GetCocoaWindow()).Screen()
	fmt.Println(screen.MaximumPotentialExtendedDynamicRangeColorComponentValue())

	return nil
}
