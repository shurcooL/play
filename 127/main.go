// Play with benchmarking a tight loop with many iterations and a func call, compare gc vs. GopherJS performance.
package main

import (
	"fmt"
	"math"
	"time"
)

func termPow(k float64) float64 {
	return 4 * math.Pow(-1, k) / (2*k + 1)
}

func termIf(k int32) float64 {
	if k%2 == 0 {
		return 4 / (2*float64(k) + 1)
	} else {
		return -4 / (2*float64(k) + 1)
	}
}

// piPow performs n iterations to compute an
// approximation of pi using math.Pow.
func piPow(n int32) float64 {
	f := 0.0
	for k := int32(0); k <= n; k++ {
		f += termPow(float64(k))
	}
	return f
}

// piIf performs n iterations to compute an
// approximation of pi.
func piIf(n int32) float64 {
	f := 0.0
	for k := int32(0); k <= n; k++ {
		f += termIf(k)
	}
	return f
}

func main() {
	// Start measuring time from now.
	started := time.Now()

	const n = 1000 * 1000 * 1000
	fmt.Printf("approximating pi with %v iterations.\n", n)
	fmt.Println(piIf(n))

	fmt.Printf("total time taken is: %v\n", time.Since(started))
}
