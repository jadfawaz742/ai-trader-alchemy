import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

// Phase 4: Enhanced Authentication with Strong Password Validation
const emailSchema = z.string()
  .email("Invalid email address")
  .max(255, "Email must be less than 255 characters");

const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const authSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    checks: {
      length: boolean;
      uppercase: boolean;
      lowercase: boolean;
      number: boolean;
      special: boolean;
    };
  }>({
    score: 0,
    checks: {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    }
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  // Calculate password strength
  useEffect(() => {
    const checks = {
      length: password.length >= 12,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };

    const score = Object.values(checks).filter(Boolean).length;
    setPasswordStrength({ score, checks });
  }, [password]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Client-side validation with Zod (Phase 4)
      const validationResult = authSchema.safeParse({ email, password });
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(e => e.message).join(", ");
        setError(errors);
        setLoading(false);
        return;
      }

      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          setError("An account with this email already exists. Please sign in instead.");
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Success!",
          description: "Please check your email to confirm your account.",
        });
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Basic email validation for sign in (Phase 4)
      const emailValidation = emailSchema.safeParse(email);
      if (!emailValidation.success) {
        setError(emailValidation.error.issues[0].message);
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please check your credentials and try again.");
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength.score <= 2) return "text-destructive";
    if (passwordStrength.score <= 4) return "text-yellow-600";
    return "text-green-600";
  };

  const getPasswordStrengthLabel = () => {
    if (password.length === 0) return "";
    if (passwordStrength.score <= 2) return "Weak";
    if (passwordStrength.score <= 4) return "Good";
    return "Strong";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-slate-700">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl sm:text-2xl text-center font-bold">AI Trading Bot</CardTitle>
          <CardDescription className="text-center text-sm sm:text-base">
            Sign in to your account or create a new one
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-10 sm:h-11">
              <TabsTrigger value="signin" className="text-sm sm:text-base">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-sm sm:text-base">Sign Up</TabsTrigger>
            </TabsList>
            
            {error && (
              <Alert className="mt-4 border-destructive bg-destructive/10">
                <AlertDescription className="text-destructive text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-sm sm:text-base">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 sm:h-11 text-sm sm:text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-sm sm:text-base">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 sm:h-11 text-sm sm:text-base"
                  />
                </div>
                <Button type="submit" className="w-full h-10 sm:h-11 text-sm sm:text-base" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm sm:text-base">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 sm:h-11 text-sm sm:text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm sm:text-base">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a strong password (min 12 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 sm:h-11 text-sm sm:text-base"
                  />
                  
                  {/* Password strength indicator */}
                  {password.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Password strength:</span>
                        <span className={`text-xs font-medium ${getPasswordStrengthColor()}`}>
                          {getPasswordStrengthLabel()}
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          {passwordStrength.checks.length ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={passwordStrength.checks.length ? "text-green-600" : "text-muted-foreground"}>
                            At least 12 characters
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {passwordStrength.checks.uppercase ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={passwordStrength.checks.uppercase ? "text-green-600" : "text-muted-foreground"}>
                            One uppercase letter
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {passwordStrength.checks.lowercase ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={passwordStrength.checks.lowercase ? "text-green-600" : "text-muted-foreground"}>
                            One lowercase letter
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {passwordStrength.checks.number ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={passwordStrength.checks.number ? "text-green-600" : "text-muted-foreground"}>
                            One number
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {passwordStrength.checks.special ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={passwordStrength.checks.special ? "text-green-600" : "text-muted-foreground"}>
                            One special character
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-10 sm:h-11 text-sm sm:text-base" 
                  disabled={loading || (password.length > 0 && passwordStrength.score < 5)}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign Up
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;