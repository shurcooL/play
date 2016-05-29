// Package goon is an unfinished rewrite of go-goon from scratch.
package goon

import "github.com/shurcooL/go-goon"

// Sdump ...
func Sdump(a ...interface{}) string {
	return goon.Sdump(a...)
}
