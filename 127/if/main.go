// Play with benchmarking a tight loop with many iterations and a func call, compare gc vs GopherJS performance.
//
// An alternative more close-to-metal implementation that doesn't use math.Pow.
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

// pi performs n iterations to compute an approximation of pi.
func pi(n int32) float64 {
	f := 0.0
	for k := int32(0); k <= n; k++ {
		f += term(k)
	}
	return f
}

func main() {
	// Start measuring time from now.
	started := time.Now()

	const n = 1000 * 1000 * 1000
	fmt.Printf("approximating pi with %v iterations.\n", n)
	fmt.Println(pi(n))

	fmt.Println("total time taken is:", time.Since(started))
}
