package simpletest

import "testing"

func TestBasicLib(t *testing.T) {
	if 1+2 != 3 {
		t.Error("failed a basic library test")
	}
}
