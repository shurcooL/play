// Play with benchmarking a tight loop with many iterations and a func call.
//
// A concurrent version.
//
// Disclaimer: This is a microbenchmark and is very poorly representative of
//             overall general real world performance of larger applications.
//
package main

import (
	"fmt"
	"time"
)

func term(k int32) float64 {
	if k%2 == 0 {
		return 4 / (2*float64(k) + 1)
	} else {
		return -4 / (2*float64(k) + 1)
	}
}

// pi performs [n0, n1) iterations to compute an approximation of pi.
func pi(n0, n1 int32) float64 {
	f := 0.0
	for k := n0; k < n1; k++ {
		f += term(k)
	}
	return f
}

// concurrentPi performs n iterations across p goroutines to compute an approximation of pi.
func concurrentPi(n int32, p int32) float64 {
	parts := make(chan float64, p)

	// Fan out.
	for i := int32(0); i < p; i++ {
		go func(i int32) {
			parts <- pi(n/p*i, n/p*(i+1))
		}(i)
	}

	// Gather results.
	f := 0.0
	for i := int32(0); i < p; i++ {
		f += <-parts
	}

	return f
}

func main() {
	// Start measuring time from now.
	started := time.Now()

	const n = 1000 * 1000 * 1000
	const p = 8
	fmt.Printf("approximating pi with %v iterations (%v goroutines).\n", n, p)
	fmt.Println(concurrentPi(n, p))

	fmt.Printf("total time taken is: %v\n", time.Since(started))
}
