typedef signed char BOOL;
typedef unsigned long long uint64_t;

struct Device {
	BOOL         headless;
	BOOL         lowPower;
	BOOL         removable;
	uint64_t     registryID;
	const char * name;
};

struct Devices {
	struct Device * devices;
	int             length;
};

struct Device CreateSystemDefaultDevice();
struct Devices CopyAllDevices();
