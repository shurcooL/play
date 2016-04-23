package main_test

import (
	"log"
	"testing"

	"github.com/google/go-github/github"
)

func BenchmarkClientDo_rateLimitError(b *testing.B) {
	gh := github.NewClient(nil)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := gh.Repositories.Get("shurcooL", "vfsgen")
		if _, ok := err.(*github.RateLimitError); !ok {
			log.Println("no *github.RateLimitError error")
		}
	}
}
