package main

import (
	"fmt"
	"runtime"
	"time"

	glfw "github.com/go-gl/glfw3"
)

func init() {
	runtime.LockOSThread()
}

func wait() {
	time.Sleep(100 * time.Millisecond)
	//runtime.Gosched()
	//time.Sleep(100 * time.Millisecond)
}

func main() {
	glfw.Init()

	fmt.Println("App started")

	// Here is an error that is caught
	_, err := glfw.CreateWindow(-5473548, 2354234, "Testing", nil, nil)
	//wait()
	if err != nil {
		fmt.Println(err)
	}

	//wait()

	// Here is uncaught error between two caught errors
	glfw.WindowHint(-23123, 0)

	wait()

	// Here is another error that is caught
	_, err = glfw.CreateWindow(-5473548, 2354234, "Testing", nil, nil)
	//wait()
	if err != nil {
		fmt.Println(err)
	}

	//wait()

	// Here is two uncaught errors
	glfw.WindowHint(-23123, 0)

	//wait()

	glfw.WindowHint(-23123, 0)

	wait()

	fmt.Println("No deadlock")
}
