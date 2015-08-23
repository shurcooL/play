package main

import "testing"

func TestDoNothingForASecond(t *testing.T) {
	_ = DoNothingForASecond()
}

func BenchmarkDoNothingForASecond(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = DoNothingForASecond()
	}
}
