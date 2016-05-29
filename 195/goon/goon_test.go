package goon_test

import (
	"testing"

	"github.com/shurcooL/goon"
)

func Test(t *testing.T) {
	tests := []struct {
		in   interface{}
		want string
	}{
		{
			in:   (string)("hi there"),
			want: `(string)("hi there")` + "\n",
		},
	}
	for _, test := range tests {
		got := goon.Sdump(test.in)
		if got != test.want {
			t.Errorf("got %#v, want %#v", got, test.want)
		}
	}
}
