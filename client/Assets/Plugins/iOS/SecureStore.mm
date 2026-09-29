#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <stdlib.h>
#include <string.h>

static NSMutableDictionary *queryForKey(const char *key) {
    return [@{(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
              (__bridge id)kSecAttrService: @"com.kiemkhaitienlo.session",
              (__bridge id)kSecAttrAccount: [NSString stringWithUTF8String:key]} mutableCopy];
}

extern "C" void KKSecureSave(const char *key, const char *value) {
    NSMutableDictionary *query = queryForKey(key);
    SecItemDelete((__bridge CFDictionaryRef)query);
    query[(__bridge id)kSecValueData] = [[NSString stringWithUTF8String:value] dataUsingEncoding:NSUTF8StringEncoding];
    SecItemAdd((__bridge CFDictionaryRef)query, NULL);
}

extern "C" char *KKSecureLoad(const char *key) {
    NSMutableDictionary *query = queryForKey(key);
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = NULL;
    if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &result) != errSecSuccess) return NULL;
    NSData *data = (__bridge_transfer NSData *)result;
    NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return value ? strdup([value UTF8String]) : NULL;
}

extern "C" void KKSecureDelete(const char *key) {
    NSMutableDictionary *query = queryForKey(key);
    SecItemDelete((__bridge CFDictionaryRef)query);
}

extern "C" void KKSecureFree(void *pointer) { free(pointer); }
