package main

import (
	"fmt"
	"go/build"
	"runtime"

	"github.com/shurcooL/play/199/hello-world/greeting"
)

func main() {
	fmt.Printf("%s brave new world! It is working on %v %v/%v!", greeting.Phrase, runtime.Version(), build.Default.GOOS, build.Default.GOARCH)
	if build.Default.GOARCH == "js" {
		fmt.Print(" That means you can execute it in browsers.")
	}
	fmt.Println()
}
