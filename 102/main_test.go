package painkiller

import (
	"encoding/json"
	"fmt"
)

// Check that all expected interfaces are implemented.
var (
	pillValue   Pill
	pillPointer *Pill

	_ fmt.Stringer     = pillValue
	_ fmt.GoStringer   = pillValue
	_ json.Marshaler   = pillValue
	_ json.Unmarshaler = pillPointer
)
