package main

import "foo/bar"
import "doesnt/exist"

func main() {
	bar.Do(exist.Nothing)
	f()
}
