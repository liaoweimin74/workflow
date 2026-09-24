public class GenHash {
    public static void main(String[] args) {
        String password = args.length > 0 ? args[0] : "admin123";
        String hash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(password);
        System.out.println("Password: " + password);
        System.out.println("Hash:     " + hash);
    }
}