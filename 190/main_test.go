package main

import "testing"

var result *int

func OldInt(v int) *int {
	p := new(int)
	*p = v
	return p
}

func NewInt(v int) *int {
	return &v
}

func BenchmarkOldInt(b *testing.B) {
	var r *int
	for i := 0; i < b.N; i++ {
		r = OldInt(i)
	}
	result = r
}

func BenchmarkNewInt(b *testing.B) {
	var r *int
	for i := 0; i < b.N; i++ {
		r = NewInt(i)
	}
	result = r
}
