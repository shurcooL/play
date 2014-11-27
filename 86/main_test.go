package main

import (
	"testing"
	"time"
)

func BenchmarkSequentialMultiParseProviderSinglePart(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		time.Sleep(time.Second)
	}
}

func BenchmarkGoCreate(b *testing.B) {
	b.ReportAllocs()
	ch := make(chan int, 1)
	for i := 0; i < b.N; i++ {
		go func(i int) { ch <- i }(i)
		<-ch
	}
}

func fn(ch chan int, i int) { ch <- i }

func BenchmarkGoCreateNonClosure(b *testing.B) {
	b.ReportAllocs()
	ch := make(chan int, 1)
	for i := 0; i < b.N; i++ {
		go fn(ch, i)
		<-ch
	}
}

func BenchmarkGoCreateNonClosure2(b *testing.B) {
	b.ReportAllocs()
	ch := make(chan int, 1)
	for i := 0; i < b.N; i++ {
		go func(ch chan int, i int) { ch <- i }(ch, i)
		<-ch
	}
}
