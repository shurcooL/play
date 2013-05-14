package main

import (
	"sync"
	"time"
)

var _ = time.Sleep
var _ sync.WaitGroup

func main() {
	x := 1
	y := 2

	if false {
		x++; println("x++")
		y++; println("y++")
	} else {
		var w sync.WaitGroup
		w.Add(2)
		go func() { time.Sleep(7001); x++; println("x++"); w.Done() }()
		go func() { time.Sleep(1); y++; println("y++"); w.Done() }()
		w.Wait()
	}

	print(x + y)
}