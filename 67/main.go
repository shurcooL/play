package main

import (
	"fmt"
	"time"

	"github.com/bradfitz/iter"
)

//var running = make(chan struct{})
var finish = make(chan error)

func foo(ch chan int) {
Outer:
	for i := range iter.N(100) {
		select {
		case ch <- i:
			fmt.Println("sending", i)
		//case <-running:
		case finish <- fmt.Errorf("finished at %v", i):
			break Outer
		}
	}
	close(ch)
	fmt.Println("foo exit!")
}

func main() {
	ch := make(chan int)

	go foo(ch)

	for i := range ch {
		fmt.Println("reading", i)

		if i >= 10 {
			break
		}
	}

	//close(running)

	err := <-finish
	fmt.Println(err)

	time.Sleep(time.Second)
}
