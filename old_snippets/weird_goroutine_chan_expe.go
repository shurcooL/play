// +build ignore

package main

import ()

func f(ch chan int) {
	ch <- 5
	ch <- 4
	ch <- 3
}

func main() {
	in := make(chan int)
	out := make(chan int)

	go func(in, out chan int) {
		for {
			got := <-in
			println("in goroutine got:", got)
			out <- got * 1000
		}
	}(in, out)

	for i := 1; i <= 3; i++ {
		println("sending:", i)
		in <- i
		println("recving:", <-out)
	}
}
