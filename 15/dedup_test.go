package dedup

import (
	"testing"

	"github.com/bmizerany/assert"
)

var dedupTests = []struct {
	exp  []string
	orig []string
}{
	{[]string{"a", "b"}, []string{"a", "b"}},
	{[]string{"a"}, []string{"a", "a"}},
	{[]string{"a"}, []string{"a", "a", "a"}},
	{[]string{"b"}, []string{"b", "b", "b"}},
	{[]string{"a", "b"}, []string{"a", "b"}},
	{[]string{"a", "b"}, []string{"a", "a", "b"}},
	{[]string{"a", "b"}, []string{"a", "b", "b"}},
	{[]string{"a", "b", "c"}, []string{"a", "b", "c"}},
	{[]string{"a", "b", "c"}, []string{"a", "a", "b", "a", "b", "c"}},
	{[]string{"a", "b", "c", "d"}, []string{"a", "b", "c", "d"}},
	{[]string{"a"}, []string{"a", "a", "a", "a", "a", "a"}},
	{[]string{"a", "c"}, []string{"a", "a", "c", "a", "a", "a"}},
	{[]string{"a", "b"}, []string{"a", "b", "a", "b", "a", "b"}},
}

func TestDedupStrings(t *testing.T) {
	var empty []string

	assert.Equal(t, 0, len(DedupStrings(empty)))
	for _, tc := range dedupTests {
		freshInput := make([]string, len(tc.orig))
		copy(freshInput, tc.orig)
		assert.Equal(t, tc.exp, DedupStrings(freshInput))
	}
}

var benchDummyResult []string

func BenchmarkDedup(b *testing.B) {
	var res []string
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		for _, tc := range dedupTests {
			res = DedupStrings(tc.orig)
		}
	}
	benchDummyResult = res
}

func BenchmarkDedupFresh(b *testing.B) {
	var res []string
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		for _, tc := range dedupTests {
			freshInput := make([]string, len(tc.orig))
			copy(freshInput, tc.orig)
			res = DedupStrings(freshInput)
		}
	}
	benchDummyResult = res
}
