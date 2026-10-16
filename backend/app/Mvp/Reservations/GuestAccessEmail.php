<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use DateTimeImmutable;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class GuestAccessEmail
{
    public static function build(
        #[\SensitiveParameter]
        array $payload,
        #[\SensitiveParameter]
        array $config,
        string $attemptId,
        string $createdAt
    ): Email {
        $recipient = (string) $payload['recipient'];
        $type = (string) ($payload['type'] ?? 'email_verification');
        $code = (string) ($payload['code'] ?? '');
        $reference = isset($payload['reference']) ? (string) $payload['reference'] : '';

        $email = (new Email())
            ->from(new Address($config['senderEmail'], $config['senderName']))
            ->to($recipient)
            ->date(new DateTimeImmutable($createdAt));

        if (!empty($config['replyTo'])) {
            $email->replyTo($config['replyTo']);
        }

        $email->getHeaders()->addIdHeader('Message-ID', $attemptId . '@gazaairport.com');

        $escape = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        if ($type === 'email_verification') {
            $subject = 'Gaza Gateway · Email Verification Code · ' . $code;

            $text = "Palestinian Airlines / Gaza International Airport\n"
                . "Email Verification Code\n\n"
                . "Your verification code is: {$code}\n"
                . "This code expires in 10 minutes.\n"
                . "If you did not request this verification, please ignore this email.\n\n"
                . "الخطوط الجوية الفلسطينية / مطار غزة الدولي\n"
                . "رمز التحقق من البريد الإلكتروني\n\n"
                . "رمز التحقق الخاص بك هو: {$code}\n"
                . "صالح لمدة ١٠ دقائق.\n"
                . "إذا لم تطلب رمز التحقق هذا، يُرجى تجاهل هذه الرسالة.\n";

            $html = '<section lang="en" dir="ltr" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">Gaza International Airport</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">Palestinian Airlines · Guest Verification</p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">Use the verification code below to verify your email address:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace">' . $escape($code) . '</span>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>'
                . '</article>'
                . '</section>'
                . '<section lang="ar" dir="rtl" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">مطار غزة الدولي</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">الخطوط الجوية الفلسطينية · تأكيد البريد</p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">استخدم رمز التحقق التالي لتأكيد بريدك الإلكتروني:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace" dir="ltr">' . $escape($code) . '</span>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">صالح لمدة ١٠ دقائق. إذا لم تطلب هذا الرمز، يُرجى تجاهل هذه الرسالة.</p>'
                . '</article>'
                . '</section>';
        } else {
            $subject = 'Gaza Gateway · Access Code for ' . $reference . ' · ' . $code;

            $text = "Palestinian Airlines / Gaza International Airport\n"
                . "Reservation Access Code: {$reference}\n\n"
                . "Your access code is: {$code}\n"
                . "This code expires in 10 minutes.\n"
                . "If you did not request to manage this reservation, please ignore this email.\n\n"
                . "الخطوط الجوية الفلسطينية / مطار غزة الدولي\n"
                . "رمز الوصول لإدارة الحجز: {$reference}\n\n"
                . "رمز الوصول الخاص بك هو: {$code}\n"
                . "صالح لمدة ١٠ دقائق.\n"
                . "إذا لم تطلب إدارة هذا الحجز، يُرجى تجاهل هذه الرسالة.\n";

            $html = '<section lang="en" dir="ltr" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">Gaza International Airport</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">Reservation Access · <strong dir="ltr">' . $escape($reference) . '</strong></p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">Use the code below to access and manage your reservation:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace">' . $escape($code) . '</span>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">This code expires in 10 minutes. If you did not request access, please ignore this email.</p>'
                . '</article>'
                . '</section>'
                . '<section lang="ar" dir="rtl" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">مطار غزة الدولي</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">إدارة الحجز · <strong dir="ltr">' . $escape($reference) . '</strong></p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">استخدم رمز الوصول التالي لإدارة وتأكيد حجزك:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace" dir="ltr">' . $escape($code) . '</span>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">صالح لمدة ١٠ دقائق. إذا لم تطلب الوصول لهذا الحجز، يُرجى تجاهل هذه الرسالة.</p>'
                . '</article>'
                . '</section>';
        }

        $fullHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;background:#eee7d8;color:#25352b;font-family:Arial,sans-serif">' . $html . '</body></html>';

        return $email->subject($subject)->text($text)->html($fullHtml);
    }
}
