// Learn about https://github.com/gopherjs/gopherjs/issues/290.
package main

import "foo/bar"
import "doesnt/exist"

func main() {
	bar.Do(exist.Nothing)
	f()
}
