// gopherjs test issue where main() is executed even during tests, when it shouldn't be.
package main

import "time"

func main() {
	panic("we should not get here during a test")
}

// DoNothingForASecond does nothing for a second and returns nothing.
func DoNothingForASecond() struct{} {
	time.Sleep(time.Second)
	return struct{}{}
}
