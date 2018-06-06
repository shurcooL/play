// Package mtl is a tiny subset of the Metal API.
package mtl

import (
	"errors"
	"unsafe"
)

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework Metal
#include <stdlib.h>
#include "mtl.h"
*/
import "C"

// Device is abstract representation of the GPU that
// serves as the primary interface for a Metal app.
type Device struct {
	// Headless indicates whether a device is configured as headless.
	Headless bool

	// LowPower indicates whether a device is low-power.
	LowPower bool

	// Removable determines whether or not a GPU is removable.
	Removable bool

	// RegistryID is the registry ID value for the device.
	RegistryID uint64

	// Name is the name of the device.
	Name string
}

// CreateSystemDefaultDevice returns the preferred system default Metal device.
func CreateSystemDefaultDevice() (Device, error) {
	d := C.CreateSystemDefaultDevice()
	if d == nil {
		return Device{}, errors.New("Metal is not supported on this system")
	}
	defer C.free(unsafe.Pointer(d))

	return Device{
		Headless:   d.headless != 0,
		LowPower:   d.lowPower != 0,
		Removable:  d.removable != 0,
		RegistryID: uint64(d.registryID),
		Name:       C.GoString(d.name),
	}, nil
}

// CopyAllDevices returns all Metal devices in the system.
func CopyAllDevices() []Device {
	d := C.CopyAllDevices()
	defer C.free(unsafe.Pointer(d.devices))

	ds := make([]Device, d.length)
	for i := 0; i < len(ds); i++ {
		d := (*C.struct_Device)(unsafe.Pointer(uintptr(unsafe.Pointer(d.devices)) + uintptr(i)*C.sizeof_struct_Device))

		ds[i].Headless = d.headless != 0
		ds[i].LowPower = d.lowPower != 0
		ds[i].Removable = d.removable != 0
		ds[i].RegistryID = uint64(d.registryID)
		ds[i].Name = C.GoString(d.name)
	}
	return ds
}
